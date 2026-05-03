import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dispatchRouter from "./dispatch";
import queueRouter from "./queue";
import agentsRouter from "./agents";
import callsRouter from "./calls";
import tokenRouter from "./token";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dispatchRouter);
router.use(queueRouter);
router.use(agentsRouter);
router.use(callsRouter);
router.use(tokenRouter);

export default router;
