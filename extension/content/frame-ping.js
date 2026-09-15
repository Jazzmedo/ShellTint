// Tells ShellTint a frame exists, so frames it missed (for example after the
// background page restarted) still get their website style.
browser.runtime.sendMessage({ type: 'st:frame-ready' }).catch(() => { });
