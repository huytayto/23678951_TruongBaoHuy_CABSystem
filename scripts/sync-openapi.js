const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const specDirectory = path.resolve(__dirname, '../API-Specifications');
const yamlPath = path.join(specDirectory, 'cab-openapi-spec.yaml');
const jsonPath = path.join(specDirectory, 'cab-openapi-spec.json');
const specification = YAML.parse(fs.readFileSync(yamlPath, 'utf8'));

if (!specification || specification.openapi !== '3.0.3' || !specification.paths) {
  throw new Error('The combined OpenAPI document is missing its version or paths');
}

fs.writeFileSync(jsonPath, `${JSON.stringify(specification, null, 2)}\n`);
console.log(`Synchronized ${path.basename(jsonPath)} from ${path.basename(yamlPath)}`);
