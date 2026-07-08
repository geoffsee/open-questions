import { Badge } from "@chakra-ui/react";
import { getRiskBadgeColors, type ProblemRisk } from "../lib/risk";

interface RiskBadgeProps {
  risk: ProblemRisk;
}

export default function RiskBadge({ risk }: RiskBadgeProps) {
  const colors = getRiskBadgeColors(risk.level);

  return (
    <Badge
      bg={colors.bg}
      color={colors.color}
      fontFamily="mono"
      fontSize="0.68rem"
      textTransform="none"
      whiteSpace="nowrap"
    >
      {risk.label}
    </Badge>
  );
}
