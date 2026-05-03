import { Router, type IRouter } from "express";
import healthRouter from "./health";
import weatherRouter from "./weather";
import settingsRouter from "./settings";
import eventsRouter from "./events";

const router: IRouter = Router();

router.use(healthRouter);
router.use(weatherRouter);
router.use(settingsRouter);
router.use(eventsRouter);

export default router;
