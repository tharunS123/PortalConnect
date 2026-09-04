import { Router, type Request } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { NotFoundError } from '../../lib/errors.js';
import { recordAudit } from '../auth/auth.repository.js';
import {
  createCustomerSchema,
  customerIdParamSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
  type CreateCustomerInput,
  type ListCustomersQuery,
  type UpdateCustomerInput,
} from './customers.schemas.js';
import {
  createCustomer,
  customerStats,
  deleteCustomer,
  findCustomerById,
  listCustomers,
  updateCustomer,
} from './customers.repository.js';

export const customersRouter: Router = Router();

function pathId(req: Request): string {
  return (req.params as { id: string }).id;
}

customersRouter.use(authenticate);

customersRouter.get(
  '/',
  requirePermission('customers', 'canView'),
  validate(listCustomersQuerySchema, 'query'),
  (req, res) => {
    res.json(listCustomers(req.query as unknown as ListCustomersQuery));
  },
);

customersRouter.get('/stats', requirePermission('customers', 'canView'), (_req, res) => {
  res.json(customerStats());
});

customersRouter.get(
  '/:id',
  requirePermission('customers', 'canView'),
  validate(customerIdParamSchema, 'params'),
  (req, res) => {
    const customer = findCustomerById(pathId(req));
    if (!customer) throw new NotFoundError('Customer');
    res.json(customer);
  },
);

customersRouter.post(
  '/',
  requirePermission('customers', 'canCreate'),
  validate(createCustomerSchema),
  (req, res) => {
    const customer = createCustomer(req.body as CreateCustomerInput, req.user!.id);

    recordAudit({
      actorId: req.user!.id,
      action: 'customer.created',
      entityType: 'customer',
      entityId: customer.id,
      ipAddress: req.ip ?? null,
    });

    res.status(201).json(customer);
  },
);

customersRouter.patch(
  '/:id',
  requirePermission('customers', 'canEdit'),
  validate(customerIdParamSchema, 'params'),
  validate(updateCustomerSchema),
  (req, res) => {
    const id = pathId(req);
    if (!findCustomerById(id)) throw new NotFoundError('Customer');

    const updated = updateCustomer(id, req.body as UpdateCustomerInput);
    if (!updated) throw new NotFoundError('Customer');

    recordAudit({
      actorId: req.user!.id,
      action: 'customer.updated',
      entityType: 'customer',
      entityId: id,
      metadata: req.body,
      ipAddress: req.ip ?? null,
    });

    res.json(updated);
  },
);

customersRouter.delete(
  '/:id',
  requirePermission('customers', 'canDelete'),
  validate(customerIdParamSchema, 'params'),
  (req, res) => {
    const id = pathId(req);
    if (!deleteCustomer(id)) throw new NotFoundError('Customer');

    recordAudit({
      actorId: req.user!.id,
      action: 'customer.deleted',
      entityType: 'customer',
      entityId: id,
      ipAddress: req.ip ?? null,
    });

    res.status(204).send();
  },
);
