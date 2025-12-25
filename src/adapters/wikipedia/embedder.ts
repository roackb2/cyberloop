import { type OpenAI } from 'openai';

import type { StateEmbedder } from '../../core/kinematics/interfaces';
import type { WikiState } from './types';

export class WikipediaEmbedder implements StateEmbedder<WikiState> {
  constructor(private openai: OpenAI) { }

  async embed(state: WikiState): Promise<number[]> {
    // We embed the "Trajectory Vector": Semantic Context
    // Input: Current Topic + Goal
    // This allows the kinematic engine to track if we are moving TOWARDS the goal semantically
    // or drifting into unrelated topics.

    // NOTE: In v2.1 Kinetic Theory, the "Position" is the semantic embedding of the current state.
    // The "Velocity" is the delta between previous and current.
    // The "Heading" is the direction relative to Origin.

    const text = `Topic: ${state.currentTitle}\nSummary: ${state.summary.slice(0, 500)}`;

    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float'
    });

    return response.data[0].embedding;
  }

  // Helper to embed multiple texts (for policy ranking)
  async embedBatch(texts: string[]): Promise<number[][]> {
    // OpenAI limits batch size, but for demo usually ok < 2048
    if (texts.length === 0) return [];

    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
      encoding_format: 'float'
    });

    return response.data.map(d => d.embedding);
  }
}
