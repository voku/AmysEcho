# Command Matrix

Run from repository root unless stated otherwise.

## Webapp

- `npm ci --prefix webapp`
- `npm run type-check --prefix webapp`
- `npm run lint --prefix webapp`
- `npm test --prefix webapp`
- `npm run build --prefix webapp`

## Server

- `npm ci --prefix server`
- `npm run type-check --prefix server`
- `PY_BIN=$(node ./server/scripts/resolve-python-bin.mjs) && "$PY_BIN" -m pip install -r server/requirements.txt`
- `npm test --prefix server`

## Integration

- `npm ci --prefix integration`
- `npm test --prefix integration`

## Targeted workflow smoke (when touching training workflows)

- `npm run train:workflow:smoke --prefix server`
