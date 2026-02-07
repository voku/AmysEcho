export type MetacomCellType = 'symbol' | 'board';
export type MetacomSymbolRole = 'person' | 'action' | 'object' | 'modifier' | 'negation';

export interface MetacomCellBase {
  id: string;
  label: string;
  emoji: string;
  position: number;
  category?: string;
  color?: string;
  role?: MetacomSymbolRole;
  tags?: string[];
}

export interface MetacomSymbolCell extends MetacomCellBase {
  type: 'symbol';
  speech?: string;
  symbolId?: string;
}

export interface MetacomBoardCell extends MetacomCellBase {
  type: 'board';
  targetBoardId: string;
  speech?: string;
}

export type MetacomCell = MetacomSymbolCell | MetacomBoardCell;

export interface MetacomBoardDefinition {
  id: string;
  label: string;
  rows: number;
  columns: number;
  cells: MetacomCell[];
}
