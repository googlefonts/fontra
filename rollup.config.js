import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
const dependencies = require("./package.json").dependencies;

export default Object.keys(dependencies).map((depName) => {
  return {
    input: `node_modules/${depName}`,
    output: {
      file: `src/fontra/client/third-party/${depName}.js`,
    },
    plugins: [
      commonjs(), // <-- this handles some parsing of js syntax or something (necessary for `export { init } from "mathjax";`)
      nodeResolve({ browser: true }), // <-- this allows npm modules to be added to bundle
    ],
  };
});
