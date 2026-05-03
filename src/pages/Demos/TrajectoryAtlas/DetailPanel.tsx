// Trajectory Atlas — DetailPanel: slide-in inspector for a single trajectory.
// All Chakra, no custom CSS file.

import { Box, Button, Flex, Grid, Text } from "@chakra-ui/react";
import { LuTriangleAlert, LuX } from "react-icons/lu";
import { OutcomeBadge } from "./OutcomeBadge";
import { categoryFor, categoryToken } from "./taxonomy";
import type { Trajectory } from "./types";

export function DetailPanel({ traj, onClose }: { traj: Trajectory; onClose: () => void }) {
  return (
    <Flex
      role="dialog"
      aria-label="Trajectory details"
      direction="column"
      position="fixed"
      top={0}
      right={0}
      bottom={0}
      w={{ base: "95vw", md: "440px" }}
      bg="bg.panel"
      borderLeft="1px solid"
      borderColor="gray.subtle"
      boxShadow="xl"
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
        gap={3}
        p={4}
        borderBottom="1px solid"
        borderColor="gray.subtle"
      >
        <Box minW={0}>
          <Text fontSize="xs" color="fg.subtle" fontFamily="mono" mb={1}>
            {traj.id}
          </Text>
          <Text fontSize="sm" fontWeight="medium" color="fg">
            {traj.task}
          </Text>
        </Box>
        <Button size="xs" variant="ghost" onClick={onClose} aria-label="Close" flexShrink={0}>
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
        <Meta label="model" value={traj.model} mono />
        <Meta label="dataset" value={traj.dataset} />
        <Meta label="outcome" value={<OutcomeBadge outcome={traj.outcome} />} />
        <Meta label="steps" value={traj.step_count} mono />
        <Meta label="tokens" value={traj.tokens.toLocaleString()} mono />
        <Meta label="reward" value={traj.reward.toFixed(2)} mono />
      </Grid>

      <Text
        fontSize="11px"
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
            templateColumns="28px 4px minmax(0, 1.4fr) minmax(0, 1fr) auto"
            gap={2}
            alignItems="center"
            py={1.5}
            borderBottom="1px solid"
            borderColor="bg.subtle"
            fontSize="xs"
            color={s.ok ? "fg" : "red.500"}
          >
            <Text fontFamily="mono" fontSize="10px" color="fg.subtle">
              {String(i + 1).padStart(2, "0")}
            </Text>
            <Box w="4px" h="16px" borderRadius="2px" bg={categoryToken(categoryFor(s.name))} />
            <Text fontFamily="mono" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
              {s.name || s.tool}
            </Text>
            <Text
              fontSize="11px"
              color="fg.muted"
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
            >
              {s.role}
            </Text>
            <Flex align="center" gap={1} fontFamily="mono" fontSize="10px" color="fg.subtle">
              {s.tokens}t
              {!s.ok && <LuTriangleAlert size={11} />}
            </Flex>
          </Grid>
        ))}
      </Box>
    </Flex>
  );
}

function Meta({
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
      <Box as="span" color="fg" fontFamily={mono ? "mono" : undefined}>
        {value}
      </Box>
    </Flex>
  );
}
