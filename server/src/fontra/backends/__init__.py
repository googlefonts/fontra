backendClasses = {
    "rcjk": "fontra.backends.rcjk.RCJKBackend",
    "designspace": "fontra.backends.designspace.DesignspaceBackend",
    "ufo": "fontra.backends.designspace.UFOBackend",
}


def getBackendClass(extension):
    import importlib

    backendClass = backendClasses.get(extension)
    if backendClass is None:
        raise ValueError(f"No backend was found for '{extension}'")
    moduleName, className = backendClass.rsplit(".", 1)
    module = importlib.import_module(moduleName)
    return getattr(module, className)
