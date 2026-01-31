import { useCallback } from "react";
import * as vg from "@uwdata/vgplot";
import { MosaicChart, ChartDimensions } from "../../../../components/MosaicChart";
import { useTransformer } from "../../../../contexts/TransformerContext";

interface AttentionMatrixProps {
  layer: number;
  head: number;
  title?: string;
}

export function AttentionMatrix({ layer, head, title }: AttentionMatrixProps) {
  const { coordinator, selectedPromptId } = useTransformer();

  const setup = useCallback(async (): Promise<{ viewName: string }> => {
    if (!coordinator || selectedPromptId === null) {
      return { viewName: "empty_attention_matrix" };
    }

    const viewName = `attention_matrix_l${layer}_h${head}`;

    // Join attention_patterns to tokens view for token text
    const query = `
      CREATE OR REPLACE TEMP VIEW ${viewName} AS
      SELECT 
        ap.query_pos as query_pos,
        ap.key_pos as key_pos,
        ap.weight,
        q_tok.token_text as query_token_text,
        k_tok.token_text as key_token_text
      FROM attention_patterns ap
      JOIN tokens q_tok ON 
        ap.prompt_id = q_tok.prompt_id AND 
        ap.query_pos = q_tok.position
      JOIN tokens k_tok ON 
        ap.prompt_id = k_tok.prompt_id AND 
        ap.key_pos = k_tok.position
      WHERE ap.prompt_id = ${selectedPromptId} AND ap.layer = ${layer} AND ap.head = ${head}
      ORDER BY ap.query_pos, ap.key_pos
    `;

    await coordinator.exec(query);
    return { viewName };
  }, [coordinator, selectedPromptId, layer, head]);

  const build = useCallback(
    (setupResult: { viewName: string }, { width, height }: ChartDimensions) => {
      if (!setupResult || setupResult.viewName === "empty_attention_matrix") return null;

      return vg.plot(
        vg.cell(vg.from(setupResult.viewName), {
          x: "query_pos",
          y: "key_pos",
          fill: "weight",
          tip: (d: { query_pos: number; key_pos: number; weight: number; query_token_text: string; key_token_text: string }) =>
            `Query: ${d.query_token_text} (${d.query_pos})\nKey: ${d.key_token_text} (${d.key_pos})\nWeight: ${d.weight.toFixed(4)}`,
          inset: 0.5,
        }),
        vg.colorScheme("blues"),
        vg.xLabel("Query Position"),
        vg.yLabel("Key Position"),
        vg.colorLegend("right"),
        vg.width(width),
        vg.height(height),
        vg.marginLeft(60),
        vg.marginBottom(50),
        vg.marginTop(30),
        vg.marginRight(80)
      );
    },
    []
  );

  return (
    <MosaicChart<{ viewName: string }>
      title={title || `Attention Matrix`}
      subtitle={`Layer ${layer}, Head ${head}`}
      setup={setup}
      build={build}
      dependencies={[selectedPromptId, layer, head]}
      isReady={coordinator !== null && selectedPromptId !== null}
      loadingText="Loading attention matrix..."
    />
  );
}
