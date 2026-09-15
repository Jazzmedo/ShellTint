"""Native messaging framing: a 4-byte native-endian length, then UTF-8 JSON."""

import json
import struct
import sys
import threading

# Firefox drops the connection when a host sends a message over 1 MB.
MAX_MESSAGE_BYTES = 1024 * 1024
MAX_INCOMING_BYTES = 8 * 1024 * 1024

EOF = object()
INVALID = object()


def read_message(stream):
    """A decoded message, EOF when the browser closed the pipe, or INVALID."""
    header = stream.read(4)
    if len(header) < 4:
        return EOF
    (length,) = struct.unpack("=I", header)
    if length > MAX_INCOMING_BYTES:
        return EOF  # the stream can't be resynchronised
    body = b""
    while len(body) < length:
        chunk = stream.read(length - len(body))
        if not chunk:
            return EOF
        body += chunk
    try:
        message = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return INVALID
    return message if isinstance(message, dict) else INVALID


def encode(message):
    body = json.dumps(message, separators=(",", ":")).encode("utf-8")
    return struct.pack("=I", len(body)) + body


class Channel:
    """Thread-safe writer; refuses messages the browser would reject."""

    def __init__(self, stream=None, log=None):
        self.stream = stream or sys.stdout.buffer
        self.log = log or (lambda text: print(text, file=sys.stderr))
        self.lock = threading.Lock()

    def send(self, message):
        data = encode(message)
        if len(data) - 4 > MAX_MESSAGE_BYTES:
            self.log(f"ShellTint: {message.get('type')} is {len(data)} bytes, over the 1 MB limit; not sent")
            return False
        try:
            with self.lock:
                self.stream.write(data)
                self.stream.flush()
            return True
        except (OSError, ValueError):
            return False


def split_for_message(text, limit):
    """Pieces of text that each stay under limit bytes once JSON-encoded."""
    pieces, pos = [], 0
    while pos < len(text):
        size = min(len(text) - pos, limit)
        while size > 1 and len(json.dumps(text[pos:pos + size])) > limit:
            size //= 2
        pieces.append(text[pos:pos + size])
        pos += size
    return pieces or [""]
