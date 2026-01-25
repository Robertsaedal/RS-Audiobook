
export default function handler(req: any, res: any) {
  res.status(404).json({ error: "Endpoint deprecated. Please use local transcript files." });
}
