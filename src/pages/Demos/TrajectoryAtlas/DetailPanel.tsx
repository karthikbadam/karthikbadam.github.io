// Trajectory Atlas — DetailPanel: slide-in inspector for a single trajectory.

import { Box, Button, Flex, Grid, Text } from "@chakra-ui/react";
import { LuTriangleAlert, LuX } from "react-icons/lu";
import { CAT_COLOR, CATEGORY_LABELS } from "./taxonomy";
import type { Category, Trajectory } from "./types";

export function DetailPanel({ traj, onClose }: { traj: Trajectory; onClose: () => void }) {
  return (
    <Box
      role="dialog"
      aria-label="Trajectory details"
      position="fixed"
      top={0}
      right={0}
      bottom={0}
      w={{ base: "95vw", md: "440px" }}
      bg="bg.panel"
      borderLeft="1px solid"
      borderColor="gray.subtle"
      boxShadow="xl"
      display="flex"
      flexDirection="column"
      zIndex={50}
      animation="ta-slide-in 0.25s cubic-bezier(0.4, 0, 0.2, 1)"
      css={{
        "@keyframes ta-slide-in": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
      }}
    >
      <Flex
        justify="space-between"
        align="flex-start"
        p={4}
        borderBottom="1px solid"
        borderColor="gray.subtle"
        gap={3}
      >
        <Box minW={0}>
          <Text fontSize="xs" color="fg.subtle" fontFamily="mono" mb={1}>
            {traj.id}
          </Text>
          <Text fontSize="md" fontWeight="medium" color="fg">
            {traj.task}
          </Text>
        </Box>
        <Button
          size="xs"
          variant="ghost"
          onClick={onClose}
          aria-label="Close"
          flexShrink={0}
        >
          <LuX size={14} />
        </Button>
      </Flex>

      <Grid
        templateColumns="1fr 1fr"
        gap={2}
        px={4}
        py={3}
        borderBottom="1px solid"
        borderColor="gray.subtle"
        fontSize="xs"
      >
        <MetaRow label="model" value={traj.model} mono />
        <MetaRow label="dataset" value={traj.dataset} />
        <MetaRow
          label="outcome"
          value={
            <span className={`ta-outcome-badge ta-outcome-${traj.outcome}`}>{traj.outcome}</span>
          }
        />
        <MetaRow label="steps" value={traj.step_count} mono />
        <MetaRow label="tokens" value={traj.tokens.toLocaleString()} mono />
        <MetaRow label="duration (est.)" value={`${(traj.duration / 1000).toFixed(2)}s`} mono />
        <MetaRow label="reward" value={traj.reward.toFixed(2)} mono />
        <MetaRow label="cost" value={traj.cost ? `$${traj.cost.toExponential(2)}` : "—"} mono />
      </Grid>

      <Text
        fontSize="xs"
        fontWeight="semibold"
        color="fg.muted"
        textTransform="uppercase"
        letterSpacing="0.05em"
        px={4}
        pt={3}
        pb={2}
      >
        Trajectory steps
      </Text>
      <Box flex="1" minH={0} overflowY="auto" px={4} pb={4}>
        {traj.steps.map((s, i) => (
          <Grid
            key={i}
            templateColumns="24px 4px 80px 1fr auto"
            gap={2}
            alignItems="center"
            py={1.5}
            borderBottom="1px solid"
            borderColor="bg.subtle"
            fontSize="xs"
            color={s.ok ? "fg" : "red.500"}
          >
            <Text color="fg.subtle" fontFamily="mono" fontSize="10px">
              {String(i + 1).padStart(2, "0")}
            </Text>
            <Box
              w="4px"
              h="16px"
              borderRadius="2px"
              bg={CAT_COLOR[s.category as Category] ?? "fg.subtle"}
            />
            <Text>{CATEGORY_LABELS[s.category as Category] ?? s.category}</Text>
            <Text fontFamily="mono" color="fg.muted" overflow="hidden" textOverflow="ellipsis">
              {s.tool}
            </Text>
            <Flex gap={1} align="center" color="fg.subtle" fontFamily="mono" fontSize="10px">
              {s.tokens}t · {s.duration}ms
              {!s.ok && <LuTriangleAlert size={12} color="var(--chart-red)" />}
            </Flex>
          </Grid>
        ))}
      </Box>
    </Box>
  );
}

function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <Flex justify="space-between" align="center">
      <Text
        as="span"
        color="fg.subtle"
        textTransform="uppercase"
        letterSpacing="0.04em"
        fontSize="10px"
      >
        {label}
      </Text>
      <Box as="span" fontFamily={mono ? "mono" : undefined} color="fg">
        {value}
      </Box>
    </Flex>
  );
}
