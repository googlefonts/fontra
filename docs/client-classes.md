### UI Controllers

- EditorController
- SceneController
- CanvasController

### UI Model/View

- SceneModel
- SceneView

### Misc UI

- List
- Sliders

### Model Controllers

- FontController
- VariableGlyphController
- StaticGlyphController
- ComponentController

### Model Objects

- VariableGlyph
- StaticGlyph
- VarPath
- VarArray

### Misc Objects

- VariationModel
- Transform

### Client/Server Interaction

- RemoteObject

```mermaid
classDiagram
class VariableGlyph {
  +name
  +unicodes
  +axes
  +sources
  +layers
}

class Source {
  +name
  +location
  +layerName
}

class StaticGlyph {
  +advances
  +path
  +components
}

class Component {
  +name
  +transformation
  +location
}
EditorController-->SceneController
EditorController-->CanvasController
EditorController..>SceneView : for view<br>switching
EditorController-->FontController

CanvasController-->SceneView

SceneController-->SceneModel
SceneController-->CanvasController

SceneView-->SceneModel
SceneView-->DrawingFunctions

SceneModel-->FontController

FontController-->VariableGlyphController
FontController-->RemoteFont

VariableGlyphController-->VariableGlyph
VariableGlyphController-->StaticGlyphController : instantiation

VariableGlyph-->Source
VariableGlyph-->StaticGlyph : layers
Source-->StaticGlyph : layerName
StaticGlyphController-->StaticGlyph
StaticGlyphController-->ComponentController

StaticGlyph-->Path
StaticGlyph-->Component

RemoteFont..>EditorController : external<br>change<br>notifications
```
