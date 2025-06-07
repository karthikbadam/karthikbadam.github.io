"use client"

import { ClientOnly, IconButton, Skeleton } from "@chakra-ui/react"
import * as React from "react"
import type { ColorModeButtonProps } from "./color-mode"
import { useColorMode } from "./color-mode"
import { ColorModeIcon } from "./color-mode-icon"

export const ColorModeButton = React.forwardRef<HTMLButtonElement, ColorModeButtonProps>(
  function ColorModeButton(props, ref) {
    const { toggleColorMode } = useColorMode()
    return (
      <ClientOnly fallback={<Skeleton boxSize="8" />}>
        <IconButton
          onClick={toggleColorMode}
          aria-label="Toggle color mode"
          size="sm"
          ref={ref}
          {...props}
          css={{
            _icon: {
              width: "5",
              height: "5",
            },
          }}
          variant='subtle'
          bgColor='transparent'
        >
          <ColorModeIcon />
        </IconButton>
      </ClientOnly>
    )
  }
) 