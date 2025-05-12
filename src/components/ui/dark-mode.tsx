"use client"

import { Span } from "@chakra-ui/react"
import type { SpanProps } from "@chakra-ui/react"
import * as React from "react"

export const DarkMode = React.forwardRef<HTMLSpanElement, SpanProps>(
  function DarkMode(props, ref) {
    return (
      <Span
        color="fg"
        display="contents"
        className="chakra-theme dark"
        colorPalette="gray"
        colorScheme="dark"
        ref={ref}
        {...props}
      />
    )
  }
) 