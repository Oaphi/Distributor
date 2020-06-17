![Node.js CI](https://github.com/Oaphi/distributor/workflows/Node.js%20CI/badge.svg)

# Distributor

Distributor is a lightweight bundler that helps to build your project with minimal configuration required.
The module is capable of:

- streaming source files into single merged while preserving relative order
- enqueue bundler jobs and watch for source files change
- compile TypeScript files and install TypeScript for the project

# Dependencies

As of version 1.4.0, the package will merge identical requires of CommonJS modules and move them to the top of the dist file. Currently, only single-line `require`s are supported, but there are no restrictions of assignment type (`var`, `let`, `const`), object destructuring and partial imports.

# CLI options

Distributor module comes with a complete highly configurable CLI.
Options avaiable in latest (1.4.2) version of the module are:

````
cli.js

Pipes files into distribution

Input options:
  --exclude  File paths to exclude                                       [array]
  --order    Source files order                                          [array]

Output options:
  --module-type  Module type to wrap into
                     [string] [choices: "AMD", "CommonJS", "none", "UMD", "web"]
  --module-name  Module name                                            [string]
  --name         Output file path                                       [string]
  --output       Output source path                                     [string]

Options:
  --version    Show version number                                     [boolean]
  --config     Use external config                    [string] [default: "auto"]
  --separator  Files separator                                          [string]
  --source     Source path                                              [string]
  --start      Pipe at launch                                          [boolean]
  --watch      Watch files                                             [boolean]
  --help       Show help                                               [boolean]

````
