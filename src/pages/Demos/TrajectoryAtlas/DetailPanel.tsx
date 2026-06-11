// Trajectory Atlas — DetailPanel: slide-in inspector built on Chakra's
// Drawer. The Dashboard always renders the panel; visibility is bound to
// `selectedTrajectory` via Drawer.Root's controlled `open` prop.

import { Box, CloseButton, Drawer, Flex, Grid, Portal, Text } from "@chakra-ui/react";
import { LuTriangleAlert } from "react-icons/lu";
import { OutcomeBadge } from "./OutcomeBadge";
import { categoryFor, categoryToken } from "../../../components/taxonomy";
import type { Trajectory } from "./types";

interface DetailPanelProps {
  traj: Trajectory | null;
  onClose: () => void;
}

export function DetailPanel({ traj, onClose }: DetailPanelProps) {
  return (
    <Drawer.Root
      open={traj != null}
      onOpenChange={(d) => {
        if (!d.open) onClose();
      }}
      placement="end"
      size="sm"
    >
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            {traj && <DetailContents traj={traj} />}
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}

function DetailContents({ traj }: { traj: Trajectory }) {
  return (
    <>
      <Drawer.Header>
        <Flex justify="space-between" align="flex-start" gap={4} w="100%">
          <Box minW={0}>
            <Text fontSize="xs" color="fg.subtle" fontFamily="mono" mb={1}>
              {traj.id}
            </Text>
            <Drawer.Title fontSize="sm" fontWeight="medium" color="fg">
              {traj.task}
            </Drawer.Title>
          </Box>
          <Drawer.CloseTrigger asChild>
            <CloseButton size="xs" />
          </Drawer.CloseTrigger>
        </Flex>
      </Drawer.Header>

      <Drawer.Body p={0}>
        <Grid
          templateColumns="repeat(2, minmax(0, 1fr))"
          rowGap={4}
          columnGap={4}
          px={4}
          py={4}
          borderBottom="1px solid"
          borderColor="gray.subtle"
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
          pt={4}
          pb={2}
        >
          Trajectory steps
        </Text>
        <Box px={4} pb={4}>
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
              <Box
                w="4px"
                h="16px"
                borderRadius="2px"
                bg={categoryToken(categoryFor(s.name))}
              />
              <Text
                fontFamily="mono"
                overflow="hidden"
                textOverflow="ellipsis"
                whiteSpace="nowrap"
              >
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
              <Flex
                align="center"
                gap={1}
                fontFamily="mono"
                fontSize="10px"
                color="fg.subtle"
              >
                {s.tokens}t
                {!s.ok && <LuTriangleAlert size={11} />}
              </Flex>
            </Grid>
          ))}
        </Box>
      </Drawer.Body>
    </>
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
    <Box minW={0}>
      <Text
        color="fg.subtle"
        textTransform="uppercase"
        letterSpacing="0.05em"
        fontSize="10px"
        mb={1}
      >
        {label}
      </Text>
      <Box
        color="fg"
        fontFamily={mono ? "mono" : undefined}
        fontSize="sm"
        wordBreak="break-word"
      >
        {value}
      </Box>
    </Box>
  );
}

