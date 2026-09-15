#!/usr/bin/env python3
"""ShellTint native messaging host. The browser starts this; it isn't run by hand."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))

from shelltint.host import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
