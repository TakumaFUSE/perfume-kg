cat > src/types/react-cytoscapejs.d.ts <<'EOF'
declare module "react-cytoscapejs" {
  import * as React from "react";
  import type { Core, ElementDefinition, Stylesheet, LayoutOptions } from "cytoscape";

  export type CytoscapeComponentProps = {
    elements?: ElementDefinition[] | any;
    layout?: LayoutOptions | any;
    stylesheet?: Stylesheet[] | any;
    style?: React.CSSProperties;
    className?: string;
    cy?: (cy: Core) => void;
    wheelSensitivity?: number;
    zoomingEnabled?: boolean;
    userZoomingEnabled?: boolean;
    panningEnabled?: boolean;
    userPanningEnabled?: boolean;
    minZoom?: number;
    maxZoom?: number;
    boxSelectionEnabled?: boolean;
    autoungrabify?: boolean;
    autounselectify?: boolean;
    autolock?: boolean;
  } & React.HTMLAttributes<HTMLDivElement>;

  const CytoscapeComponent: React.ComponentType<CytoscapeComponentProps>;
  export default CytoscapeComponent;
}
EOF
