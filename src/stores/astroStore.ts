import { atom } from 'jotai';
import { interpolateRdBu } from 'd3-scale-chromatic';
import { rgb } from 'd3-color';

export interface DataPoint {
  index: number;
  sPerp: number;
  sPar: number;
  sParObs: number;
  velocity: number;
  zc: number;
  zobs: number;
}

export interface FilterRange {
  min: number;
  max: number;
}

export interface ProcessedAstroData {
  dataPoints: DataPoint[];
  positions: Float32Array;
  shadowPositions: Float32Array;
  colors: Float32Array;
  shadowColors: Float32Array;
}

const astroDataLoaderAtom = atom(async (): Promise<ProcessedAstroData> => {
  const response = await fetch("/mock_rsd.csv");
  const text = await response.text();
  
  const lines = text.trim().split("\n");
  lines.shift(); // header
  const n = lines.length;
  const pts = new Float32Array(n * 2);
  const shadowPts = new Float32Array(n * 2);
  const cols = new Float32Array(n * 3);
  const shadowCols = new Float32Array(n * 3);
  const parsedData: DataPoint[] = [];
  
  const rows = lines.map((l) => l.split(",").map(Number));
  
  // Calculate derived values
  const sPerp: number[] = [];
  const sPar: number[] = [];
  const sParObs: number[] = [];
  rows.forEach(([, , zc, , zobs, sx, sy, sz]) => {
    sPerp.push(Math.sqrt(sx * sx + sy * sy));
    sPar.push(sz);
    const distortionFactor = zobs / zc;
    sParObs.push(sz * distortionFactor);
  });
  
  const xMin = Math.min(...sPerp);
  const xMax = Math.max(...sPerp);
  const yMin = Math.min(...sPar, ...sParObs);
  const yMax = Math.max(...sPar, ...sParObs);
  const vMin = Math.min(...rows.map(([,,, vpar]) => vpar));
  const vMax = Math.max(...rows.map(([,,, vpar]) => vpar));
  
  rows.forEach(([, , zc, vpar, zobs], i) => {
    const sp = sPerp[i];
    const sp2 = sPar[i];
    const sp2Obs = sParObs[i];
    
    // Store data point
    parsedData.push({
      index: i,
      sPerp: sp,
      sPar: sp2,
      sParObs: sp2Obs,
      velocity: vpar,
      zc,
      zobs
    });
    
    // Real positions
    pts[2 * i] = ((sp - xMin) / (xMax - xMin)) * 2 - 1;
    pts[2 * i + 1] = ((sp2 - yMin) / (yMax - yMin)) * 2 - 1;
    
    // Shadow positions (redshift-distorted)
    shadowPts[2 * i] = ((sp - xMin) / (xMax - xMin)) * 2 - 1;
    shadowPts[2 * i + 1] = ((sp2Obs - yMin) / (yMax - yMin)) * 2 - 1;
    
    const t = (vpar - vMin) / (vMax - vMin);
    const c = rgb(interpolateRdBu(t));
    
    // Real point colors
    cols[3 * i] = c.r / 255;
    cols[3 * i + 1] = c.g / 255;
    cols[3 * i + 2] = c.b / 255;
    
    // Shadow colors (dimmed)
    shadowCols[3 * i] = c.r / 255 * 0.3;
    shadowCols[3 * i + 1] = c.g / 255 * 0.3;
    shadowCols[3 * i + 2] = c.b / 255 * 0.3;
  });
  
  return {
    dataPoints: parsedData,
    positions: pts,
    shadowPositions: shadowPts,
    colors: cols,
    shadowColors: shadowCols
  };
});

export const astroDataAtom = atom(get => get(astroDataLoaderAtom));

export const velocityFilterAtom = atom<FilterRange | null>(null);

export const redshiftFilterAtom = atom<FilterRange | null>(null);

export const positionFilterAtom = atom<FilterRange | null>(null);

export const filteredIndicesAtom = atom(async (get) => {
  const astroData = await get(astroDataAtom);
  
  const velocityFilter = get(velocityFilterAtom);
  const redshiftFilter = get(redshiftFilterAtom);
  const positionFilter = get(positionFilterAtom);
  
  const filteredIndices = new Set<number>();
  
  astroData.dataPoints.forEach((point: DataPoint, index: number) => {
    let include = true;
    
    if (velocityFilter && (point.velocity < velocityFilter.min || point.velocity > velocityFilter.max)) {
      include = false;
    }
    if (redshiftFilter && (point.zc < redshiftFilter.min || point.zc > redshiftFilter.max)) {
      include = false;
    }
    if (positionFilter && (point.sPerp < positionFilter.min || point.sPerp > positionFilter.max)) {
      include = false;
    }
    
    if (include) {
      filteredIndices.add(index);
    }
  });
  
  return filteredIndices;
});