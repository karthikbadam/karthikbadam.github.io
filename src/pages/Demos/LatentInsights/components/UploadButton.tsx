import { Box, Text } from "@chakra-ui/react";
import React, { useRef, useCallback, useState } from "react";
import { LuUpload } from "react-icons/lu";
import { useLatentInsights } from "../../../../contexts/LatentInsightsContext";

interface UploadButtonProps {
  onUploaded?: () => void;
}

export const UploadButton: React.FC<UploadButtonProps> = ({ onUploaded }) => {
  const { uploadDataset, state } = useLatentInsights();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const contextLoading = state.status === "loading";
  const disabled = busy || contextLoading;

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (inputRef.current) inputRef.current.value = "";
      if (!file) return;
      setBusy(true);
      try {
        const sessionId = await uploadDataset(file);
        if (sessionId) onUploaded?.();
      } finally {
        setBusy(false);
      }
    },
    [uploadDataset, onUploaded]
  );

  return (
    <Box
      as="label"
      display="inline-flex"
      alignItems="center"
      gap={1}
      px={3}
      py={1}
      border="1px solid"
      borderColor="gray.600"
      borderRadius="md"
      cursor={disabled ? "wait" : "pointer"}
      fontSize="xs"
      fontFamily="mono"
      color="fg.muted"
      _hover={{ borderColor: "fg.muted" }}
      transition="border-color 0.15s"
      opacity={disabled ? 0.5 : 1}
    >
      <LuUpload size={12} />
      <Text>{busy ? "Uploading…" : "Upload CSV"}</Text>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={handleChange}
        disabled={disabled}
        style={{ display: "none" }}
      />
    </Box>
  );
};
