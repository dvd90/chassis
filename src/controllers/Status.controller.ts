import { Request, Response } from 'express';
import { Routable, route } from '../core';

export class StatusController extends Routable {
  constructor() {
    super('/status');
  }

  /**
   * @desc   Server status
   * @access Public
   */
  @route('get', '/')
  async show(req: Request): Promise<Response> {
    return req.resHandler.ok({
      status: 'up',
      uptime: process.uptime(),
      env: process.env.NODE_ENV
    });
  }
}
