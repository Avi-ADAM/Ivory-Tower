import type { GraphEdge, GraphNode } from './types';

/** A response to a document block (or to one of its alternatives). */
export interface DocResponse {
	edgeId: string;
	rel: GraphEdge['rel'];
	anchor: GraphEdge['anchor'];
	stale: boolean;
	child: GraphNode;
}

/** One block of a document as the reader sees it. */
export interface DocBlock {
	edgeId: string;
	block: GraphNode;
	body: string;
	source: string | null;
	responses: DocResponse[];
	alternatives: { node: GraphNode; body: string; responses: DocResponse[] }[];
}
