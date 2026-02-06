// src/types/react-cytoscapejs.d.ts
declare module "react-cytoscapejs" {
  import * as React from "react";
  import type cytoscape from "cytoscape";

  export interface CytoscapeComponentProps {
    elements?: any;
    stylesheet?: any;
    layout?: any;
    style?: React.CSSProperties;
    className?: string;
    cy?: (cy: cytoscape.Core) => void;
    [key: string]: any;
  }

  const CytoscapeComponent: React.ComponentType<CytoscapeComponentProps>;
  export default CytoscapeComponent;
}
