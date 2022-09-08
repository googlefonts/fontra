# Fontra Plug-In Mechanism Overview

Fontra offers several plug-in APIs:

- [Project Manager plug-in API](#project-manager-plug-in-api)
- [View plug-in API](#view-plug-in-api)
- [File System back-end plug-in API](#file-system-back-end-plug-in-api)
- [Static Content additions](#static-content-additions)

Fontra uses Python's "entry-points" mechanism, which can be configured via
"pyproject.toml" configuration files.

## Project Manager plug-in API

The Project Manager object is responsible for loading font data, and presenting
a UI to choose and create projects.

The Fontra server has one Project Manager object. It is chosen at start-up time,
via the `fontra` subcommand. There is one built-in Project Manager, called
"filesystem".

    $ fontra filesystem path/to/folder/containing/font

Project managers are registered with the `fontra.projectmanagers` entry-points
key.

An example Project Manager plug-in can be found in the fontra-rcjk project.

## View plug-in API

A view plug-in generally contains a collection of web assets, bundled as a
Python package. They are registered under the `fontra.views` entry-points key.

## File System back-end plug-in API

The filesystem Project Manager has a plug-in API for font format backends,
a.k.a. storage backends. These backends are registered under the
`fontra.filesystem.backends` entry-points key. Example from Fontra's own
pyproject.toml file:

    [project.entry-points."fontra.filesystem.backends"]
    designspace = "fontra.backends.designspace:DesignspaceBackend"
    ufo = "fontra.backends.designspace:UFOBackend"
    ttf = "fontra.backends.truetype:TTFBackend"
    otf = "fontra.backends.truetype:TTFBackend"

The backend *name* is the filename extension used for that format. The *value*
points to a class in a Python package. The above entries match `*.designspace`
, `*.ufo`, `*.ttf` and `*.otf` files respectively.

## Static Content additions

Python packages can be used to serve additional static web content, such as
.js, .css, images, etc. This is done via the `fontra.webcontent` key. Example
snippet from a "pyproject.toml" file:

    [project.entry-points."fontra.webcontent"]
    filesystem = "fontra.filesystem"

This adds a "virtual folder" to the web server under the name "filesystem", and
static content from the folder of the `fontra.filesystem` Python package will
be available via that folder. For example, a file called "example.css" that is
part of the `fontra.filesystem` package will be visible in the browser as:

    http://localhost:8000/filesystem/example.css
