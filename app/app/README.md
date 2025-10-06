# Proxy package for npm --prefix workflows

This directory exists so commands like `npm run type-check --prefix app`
continue to work even when they are executed from within the `app/`
directory itself. npm resolves the value passed to `--prefix` relative to
the current working directory, so running the command inside `app/` would
normally look for `app/app/package.json` and fail.

The proxy `package.json` defined here simply forwards the call back to the
real project root one level up. Additional common scripts that developers
might invoke with `--prefix app` are mirrored for convenience.
