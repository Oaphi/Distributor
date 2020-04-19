![Node.js CI](https://github.com/Oaphi/distributor/workflows/Node.js%20CI/badge.svg)

# Distributor
Streams source files into single merged. 

Supports job queue and configuration


# CLI options

Distributor module comes with a complete highly configurable CLI.
Options avaiable in latest (1.3.2) version of the module are:

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
