import sys, os
print("utf8_mode", sys.flags.utf8_mode)
print("fs", sys.getfilesystemencoding())
print("file", repr(__file__))
d = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(d)
appjs = os.path.join(root, "assets", "app.js")
print("appjs", repr(appjs))
print("exists_appjs", os.path.exists(appjs))
