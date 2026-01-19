import { AttentionCard0 } from "./AttentionCard0";
import { AttentionCard1 } from "./AttentionCard1";
import { AttentionCard2 } from "./AttentionCard2";
import { AttentionCard3 } from "./AttentionCard3";
import { MLPCard0 } from "./MLPCard0";
import { MLPCard1 } from "./MLPCard1";
import { MLPCard2 } from "./MLPCard2";
import { EmbeddingCard } from "./EmbeddingCard";
import { LayerNormCard } from "./LayerNormCard";

interface StackCardProps {
  layer: number | null;
  module: "attn" | "mlp" | "norm" | "embed";
  stage: number;
  normType?: "input_norm" | "post_norm" | "final_norm";
}

export function StackCard({ layer, module, stage, normType }: StackCardProps) {
  if (module === "attn") {
    switch (stage) {
      case 0:
        return <AttentionCard0 layer={layer!} />;
      case 1:
        return <AttentionCard1 layer={layer!} />;
      case 2:
        return <AttentionCard2 layer={layer!} />;
      case 3:
        return <AttentionCard3 layer={layer!} />;
      default:
        return null;
    }
  } else if (module === "mlp") {
    switch (stage) {
      case 0:
        return <MLPCard0 layer={layer!} />;
      case 1:
        return <MLPCard1 layer={layer!} />;
      case 2:
        return <MLPCard2 layer={layer!} />;
      default:
        return null;
    }
  } else if (module === "norm") {
    return <LayerNormCard layer={layer} normType={normType || "input_norm"} />;
  } else if (module === "embed") {
    return <EmbeddingCard />;
  }
  return null;
}
