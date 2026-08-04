import type { FastifyInstance } from "fastify";
import type { GeometricDeltaReport, Result } from "@meshdiff/shared/types/diff.js";

export default async function diffRoute(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { versionAId: string; versionBId: string } }>(
    "/diff/:versionAId/:versionBId",
    async (request, reply): Promise<Result<GeometricDeltaReport>> => {
      const { versionAId, versionBId } = request.params;
      reply.code(501);
      return {
        success: false,
        error: `Diff computation not yet implemented for ${versionAId} vs ${versionBId}`,
      };
    },
  );
}
