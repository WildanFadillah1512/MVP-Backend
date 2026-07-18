import { Router } from 'express';
import {
  getProductRecipes,
  getAllRecipes,
  setProductRecipe,
  setProductRecipeBulk,
  deleteRecipeIngredient,
  calculateProduction,
  produceWithRecipe
} from '../controllers/recipe.controller';
import { authenticate, authorizeDivision, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', authorizeRole(['CEO', 'OWNER', 'ADMIN', 'MANAGER']), getAllRecipes);
router.get('/calculate', calculateProduction);
router.get('/product/:productId', getProductRecipes);

router.post('/', authorizeRole(['CEO', 'OWNER']), setProductRecipe);
router.post('/bulk', authorizeRole(['CEO', 'OWNER']), setProductRecipeBulk);
router.post('/produce', authorizeDivision(['PRODUKSI']), produceWithRecipe);

router.delete('/:id', authorizeRole(['CEO', 'OWNER']), deleteRecipeIngredient);

export default router;
