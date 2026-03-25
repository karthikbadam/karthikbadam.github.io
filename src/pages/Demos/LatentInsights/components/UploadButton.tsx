import { Box, Text } from "@chakra-ui/react";
import React, { useRef, useCallback } from "react";
import { LuUpload } from "react-icons/lu";
import { useLatentInsights } from "../../../../contexts/LatentInsightsContext";

export const UploadButton: React.FC = () => {
  const { uploadDataset, state } = useLatentInsights();
  const inputRef = useRef<HTMLInputElement>(null);
  const isLoading = state.status === "loading";

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        uploadDataset(file);
      }
      if (inputRef.current) inputRef.current.value = "";
    },
    [uploadDataset]
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
      cursor={isLoading ? "wait" : "pointer"}
      fontSize="xs"
      fontFamily="mono"
      color="fg.muted"
      _hover={{ borderColor: "fg.muted" }}
      transition="border-color 0.15s"
      opacity={isLoading ? 0.5 : 1}
    >
      <LuUpload size={12} />
      <Text>{isLoading ? "Uploading…" : "Upload CSV"}</Text>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={handleChange}
        disabled={isLoading}
        style={{ display: "none" }}
      />
    </Box>
  );
};
