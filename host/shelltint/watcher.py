"""Polls files by (mtime, size) and reports a change once they settle.

Shells rewrite colour files in bursts (matugen writes, then the mode flips),
so a change fires after the files have been still for `quiet` seconds, or at
the latest `ceiling` seconds after the first change.
"""


def signature(paths):
    out = []
    for path in paths:
        try:
            st = path.stat()
            out.append((str(path), st.st_mtime_ns, st.st_size))
        except OSError:
            out.append((str(path), None, None))
    return tuple(out)


class Debouncer:
    def __init__(self, quiet=0.75, ceiling=5.0):
        self.quiet = quiet
        self.ceiling = ceiling
        self.last = None
        self.first_change = None
        self.last_change = None

    def reset(self, sig):
        self.last, self.first_change, self.last_change = sig, None, None

    def poll(self, sig, now):
        """True when a settled change is ready to act on."""
        if self.last is None:
            self.last = sig
            return False
        if sig != self.last:
            self.last = sig
            self.last_change = now
            if self.first_change is None:
                self.first_change = now
        if self.first_change is None:
            return False
        if now - self.last_change >= self.quiet or now - self.first_change >= self.ceiling:
            self.first_change = self.last_change = None
            return True
        return False
