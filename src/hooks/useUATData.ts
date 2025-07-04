import { useEffect, useState } from "react";
import { createSampleOntology, TreeNode } from "@kvis/packed-radial-tree";

interface UseUATDataReturn {
  data: TreeNode | undefined;
  loading: boolean;
  error: string | null;
}

const parseUATData = async (): Promise<TreeNode> => {
  const response = await fetch("/data/UAT.csv");
  const csvText = await response.text();
  const lines = csvText.split("\n").slice(1);

  const root: TreeNode = {
    id: "root",
    label: "Unified Astronomy Thesaurus",
    children: [],
    value: 1,
    subtreeSize: 1,
  };

  const nodeMap = new Map<string, TreeNode>();
  nodeMap.set("root", root);

  lines.forEach((line) => {
    if (!line.trim()) return;

    const levels = line
      .split(",")
      .map((cell) => cell.trim())
      .filter((cell) => cell);

    if (levels.length === 0) return;

    let currentParent = root;
    let currentPath = "";

    levels.forEach((level, levelIndex) => {
      currentPath = currentPath ? `${currentPath}/${level}` : level;

      if (!nodeMap.has(currentPath)) {
        const newNode: TreeNode = {
          id: currentPath,
          label: level,
          children: [],
          value: 1,
          subtreeSize: 1,
          metrics: {
            depth: levelIndex + 1,
          },
        };

        nodeMap.set(currentPath, newNode);
        currentParent.children = currentParent.children || [];
        currentParent.children.push(newNode);
      }

      currentParent = nodeMap.get(currentPath)!;
    });
  });

  // Calculate values based on number of children
  const calculateValues = (node: TreeNode): number => {
    if (!node.children || node.children.length === 0) {
      node.value = 1;
      node.subtreeSize = 1;
      return 1;
    }

    const childrenValue = node.children.reduce(
      (sum, child) => sum + calculateValues(child),
      0
    );
    node.value = childrenValue;
    node.subtreeSize = childrenValue;
    return childrenValue;
  };

  calculateValues(root);
  return root;
};

export const useUATData = (): UseUATDataReturn => {
  const [data, setData] = useState<TreeNode | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const uatData = await parseUATData();
        setData(uatData);
      } catch (err) {
        console.error("Error loading UAT data:", err);
        setError("Failed to load UAT data. Using sample data instead.");
        setData(createSampleOntology());
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return { data, loading, error };
};
