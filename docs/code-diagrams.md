## Fontra Block Diagram

```mermaid
flowchart
  browser([Web browser])---client[Fontra client .js .css .html<br>HTML5 Canvas]
  client-.network.-server[Fontra server .py<br>aiohttp/websockets]
  server---ds{{.designspace .ufo<br>backend}}
  server---rcjk{{.rcjk<br>backend}}
  server---rcjk_mysql{{rcjk mysql<br>backend}}
  ds---fs([File system])
  rcjk---fs
  rcjk_mysql-.network.-rcjk_server[RoboCJK web API]
  rcjk_server---django[(Django / MySQL)]
  django---git([GitHub])
```

## Fontra Javascript Client Class Relationships

```mermaid
classDiagram
class VariableGlyph {
  name
  unicodes
  axes
  sources
  layers
}

class Source {
  name
  location
  layerName
}

class StaticGlyph {
  advances
  path
  components
}

class Component {
  name
  transformation
  location
}
EditorController-->SceneController
EditorController-->CanvasController
EditorController..>SceneView : for view<br>switching
EditorController-->FontController

CanvasController-->SceneView

SceneController-->SceneModel
SceneController-->CanvasController

SceneView-->SceneModel
SceneView-->DrawingFunctions : view layers

SceneModel-->StaticGlyphController : positioned<br>glyphs
SceneModel-->FontController

FontController-->VariableGlyphController
FontController-->RemoteFont

VariableGlyphController-->StaticGlyphController : instantiation
VariableGlyphController-->VariableGlyph

VariableGlyph-->Source
VariableGlyph-->StaticGlyph : layers
Source-->StaticGlyph : layerName
StaticGlyphController-->Path2D : caching
StaticGlyphController-->ComponentController
StaticGlyphController-->StaticGlyph


StaticGlyph-->Path
StaticGlyph-->Component

RemoteFont..>EditorController : external<br>change<br>notifications
```

## Fontra Python Server Class Relationships

```mermaid
classDiagram

class FontraServer {
  host
  httpPort
  webSocketPort
  contentFolder
  templatesFolder
  projectManager
}

class WebSocketServer {
  subjectFactory
}

class WebSocketClient {
  path
  subjectFactory
}

class ProjectManager {
  requireLogin
  login(username, password)
  getRemoteSubject(path, token, remoteIP)
  getProjectList()
}

class FontHandler {
  getGlyph(glyphName)
  getReverseCmap()
  getGlobalAxes()
}

class FontBackend {
  getGlyph(glyphName)
  getReverseCmap()
  getGlobalAxes()
}

FontraServer -- HTTPServer
FontraServer -- WebSocketServer
FontraServer --> ProjectManager

ProjectManager --> FontHandler
FontHandler --> FontBackend
FontHandler ..> WebSocketClient : broadcast<br>changes

WebSocketServer --> ProjectManager
WebSocketServer --> WebSocketClient
