import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dispatchRouter from "./dispatch";
import queueRouter from "./queue";
import agentsRouter from "./agents";
import callsRouter from "./calls";
import tokenRouter from "./token";
import settingsRouter from "./settings";
import elevenLabsRouter from "./elevenlabs";
import documentsRouter from "./documents";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dispatchRouter);
router.use(queueRouter);
router.use(agentsRouter);
router.use(callsRouter);
router.use(tokenRouter);
router.use(settingsRouter);
router.use(elevenLabsRouter);
router.use(documentsRouter);

export default router;
