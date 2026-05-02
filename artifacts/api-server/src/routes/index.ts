import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dispatchRouter from "./dispatch";
import queueRouter from "./queue";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dispatchRouter);
router.use(queueRouter);

export default router;
