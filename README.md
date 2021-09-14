# SVG-Importer

This is a tool import a svg in the [urpflanze scene](https://github.com/urpflanze-org/core)

Install with npm

```shell
npm i -S @urpflanze/svg-importer
```

Import SVGImporter:

```javascript
import { Scene } from '@urpflanze/core'
import { SVGImporter } from '@urpflanze/svg-importer'
// or const { SVGImporter } = require('@urpflanze/svg-importer')

const scene = new Urpflanze.Scene()

const imported = SVGImporter.parse(`<svg>...</svg>` /*, sideLength: 50, simplify = 0.01*/) // ShapeBuffer or Shape

scene.add(imported)
```
