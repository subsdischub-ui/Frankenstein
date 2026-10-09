import { Router, type IRouter } from "express";
import healthRouter from "./health";
import frankensteinRouter from "./frankenstein";

const router: IRouter = Router();

router.use(healthRouter);
router.use(frankensteinRouter);

export default router;
