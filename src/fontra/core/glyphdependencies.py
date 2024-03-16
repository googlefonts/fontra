from dataclasses import dataclass, field
from typing import Sequence


@dataclass(kw_only=True)
class GlyphDependencies:
    usedBy: dict[str, set[str]] = field(init=False, default_factory=dict)
    madeOf: dict[str, set[str]] = field(init=False, default_factory=dict)

    def update(self, glyphName: str, componentNames: Sequence[str]) -> None:
        # Zap previous used-by data for this glyph, if any
        for componentName in self.madeOf.get(glyphName, ()):
            if componentName in self.usedBy:
                self.usedBy[componentName].discard(glyphName)
                if not self.usedBy[componentName]:
                    del self.usedBy[componentName]

        # Update made-of
        if componentNames:
            self.madeOf[glyphName] = set(componentNames)
        else:
            # Discard
            self.madeOf.pop(glyphName, None)

        # Update used-by
        for componentName in componentNames:
            if componentName not in self.usedBy:
                self.usedBy[componentName] = set()
            self.usedBy[componentName].add(glyphName)
