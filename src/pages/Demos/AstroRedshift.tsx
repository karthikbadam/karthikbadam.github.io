import { Box } from "@chakra-ui/react";
import React, { Suspense } from "react";
import { useAtomValue } from "jotai";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { GLScatter } from "../../components/GLScatter";
import { VelocityHistogram } from "../../components/VelocityHistogram";
import { RedshiftComparison } from "../../components/RedshiftComparison";
import { astroDataAtom } from "../../stores/astroStore";

const AstroVisualization: React.FC = () => {
  const astroData = useAtomValue(astroDataAtom);

  return (
    <Box bg="#111" color="#ccc" h="calc(100vh - 100px)">
      <PanelGroup direction="horizontal">
        {/* Main scatter plot */}
        <Panel defaultSize={70} minSize={50}>
          <Box position="relative" h="100%">
            {/* Shadow layer */}
            <GLScatter positions={astroData.shadowPositions} colors={astroData.shadowColors} pointSize={1} />
            {/* Real data layer */}
            <Box position="absolute" inset={0}>
              <GLScatter positions={astroData.positions} colors={astroData.colors} pointSize={2} />
            </Box>
          </Box>
        </Panel>
        
        <PanelResizeHandle style={{ width: '2px', backgroundColor: '#333' }} />
        
        {/* Right panel with charts */}
        <Panel defaultSize={30} minSize={25}>
          <PanelGroup direction="vertical">
            {/* Velocity histogram */}
            <Panel defaultSize={50} minSize={30}>
              <Box 
                h="100%" 
                bg="rgba(0,0,0,0.8)" 
                border="1px solid #333"
                p={2}
              >
                <VelocityHistogram />
              </Box>
            </Panel>
            
            <PanelResizeHandle style={{ height: '2px', backgroundColor: '#333' }} />
            
            {/* Redshift comparison */}
            <Panel defaultSize={50} minSize={30}>
              <Box 
                h="100%" 
                bg="rgba(0,0,0,0.8)" 
                border="1px solid #333"
                p={2}
              >
                <RedshiftComparison />
              </Box>
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </Box>
  );
};

export const AstroDemo: React.FC = () => {
  return (
    <Suspense fallback={<Box bg="#111" color="#ccc" h="calc(100vh - 100px)" display="flex" alignItems="center" justifyContent="center">Loading...</Box>}>
      <AstroVisualization />
    </Suspense>
  );
};

