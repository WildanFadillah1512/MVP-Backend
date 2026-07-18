import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { errorResponse, successResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';

const getUserRole = (user: any) => user.role?.name || user.role;

// Get all recipes for a product
export const getProductRecipes = async (req: Request, res: Response) => {
  try {
    const productId = String(req.params.productId);

    const recipes = await prisma.erpProductRecipe.findMany({
      where: { productId },
      include: {
        product: true,
        ingredient: true
      },
      orderBy: { createdAt: 'asc' }
    });

    return successResponse(res, recipes, 'Product recipes retrieved successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, null, 500);
  }
};

// Get all recipes (for CEO dashboard)
export const getAllRecipes = async (req: Request, res: Response) => {
  try {
    const recipes = await prisma.erpProductRecipe.findMany({
      include: {
        product: true,
        ingredient: true
      },
      orderBy: [
        { product: { name: 'asc' } },
        { createdAt: 'asc' }
      ]
    });

    // Group by product
    const grouped = recipes.reduce((acc: any, recipe) => {
      const productId = recipe.productId;
      if (!acc[productId]) {
        acc[productId] = {
          product: recipe.product,
          ingredients: []
        };
      }
      acc[productId].ingredients.push({
        id: recipe.id,
        ingredient: recipe.ingredient,
        qtyNeeded: recipe.qtyNeeded,
        unitPrice: recipe.unitPrice,
        totalPrice: recipe.qtyNeeded * recipe.unitPrice
      });
      acc[productId].totalRecipeCost = (acc[productId].totalRecipeCost || 0) + (recipe.qtyNeeded * recipe.unitPrice);
      acc[productId].costPerOutput = acc[productId].totalRecipeCost / Math.max(1, recipe.product.recipeOutputQty || 1);
      return acc;
    }, {});

    return successResponse(res, Object.values(grouped), 'All recipes retrieved successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, null, 500);
  }
};

// Create or update recipe (CEO only)
export const setProductRecipe = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);

    if (!['CEO', 'OWNER'].includes(role)) {
      return errorResponse(res, 'Only CEO can set recipes', null, 403);
    }

    const { productId, warehouseItemId, qtyNeeded, outputQtyPerBatch, unitPrice } = req.body;

    if (!productId || !warehouseItemId || !qtyNeeded || qtyNeeded <= 0) {
      return errorResponse(res, 'Invalid recipe data', null, 400);
    }

    const recipe = await prisma.$transaction(async (tx) => {
      if (outputQtyPerBatch !== undefined) {
        const recipeOutputQty = Number(outputQtyPerBatch);
        if (!Number.isFinite(recipeOutputQty) || recipeOutputQty <= 0) {
          throw new Error('Jumlah hasil per batch harus lebih dari 0');
        }

        await tx.product.update({
          where: { id: productId },
          data: { recipeOutputQty: Math.floor(recipeOutputQty) }
        });
      }

      return tx.erpProductRecipe.upsert({
      where: {
        productId_warehouseItemId: {
          productId,
          warehouseItemId
        }
      },
      update: {
        qtyNeeded: Number(qtyNeeded),
        unitPrice: Number(unitPrice || 0)
      },
      create: {
        productId,
        warehouseItemId,
        qtyNeeded: Number(qtyNeeded),
        unitPrice: Number(unitPrice || 0)
      },
      include: {
        product: true,
        ingredient: true
      }
      });
    });

    await writeAuditLog(req, 'CREATE', 'RECIPE', `Recipe set for ${recipe.product.name}: ${recipe.qtyNeeded} ${recipe.ingredient.unit} of ${recipe.ingredient.name}`);

    return successResponse(res, recipe, 'Recipe set successfully', 201);
  } catch (error: any) {
    return errorResponse(res, error.message, null, 500);
  }
};

// Bulk set recipe (CEO only)
export const setProductRecipeBulk = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);

    if (!['CEO', 'OWNER'].includes(role)) {
      return errorResponse(res, 'Only CEO can set recipes', null, 403);
    }

    const { productId, ingredients, outputQtyPerBatch } = req.body;
    // ingredients: [{ warehouseItemId, qtyNeeded }]

    if (!productId || !ingredients || !Array.isArray(ingredients)) {
      return errorResponse(res, 'Invalid recipe data', null, 400);
    }

    const recipes = await prisma.$transaction(async (tx) => {
      const recipeOutputQty = Number(outputQtyPerBatch || 1);
      if (!Number.isFinite(recipeOutputQty) || recipeOutputQty <= 0) {
        throw new Error('Jumlah hasil per batch harus lebih dari 0');
      }

      const results = [];
      for (const ing of ingredients) {
        const recipe = await tx.erpProductRecipe.upsert({
          where: {
            productId_warehouseItemId: {
              productId,
              warehouseItemId: ing.warehouseItemId
            }
          },
          update: {
            qtyNeeded: Number(ing.qtyNeeded),
            unitPrice: Number(ing.unitPrice || 0)
          },
          create: {
            productId,
            warehouseItemId: ing.warehouseItemId,
            qtyNeeded: Number(ing.qtyNeeded),
            unitPrice: Number(ing.unitPrice || 0)
          },
          include: {
            product: true,
            ingredient: true
          }
        });
        results.push(recipe);
      }

      const totalRecipeCost = results.reduce((sum, recipe) => sum + (recipe.qtyNeeded * recipe.unitPrice), 0);
      await tx.product.update({
        where: { id: productId },
        data: {
          recipeOutputQty: Math.floor(recipeOutputQty),
          basePrice: totalRecipeCost / recipeOutputQty
        }
      });

      return results;
    });

    await writeAuditLog(req, 'CREATE', 'RECIPE', `Bulk recipe set for product with ${ingredients.length} ingredients`);

    return successResponse(res, recipes, 'Recipes set successfully', 201);
  } catch (error: any) {
    return errorResponse(res, error.message, null, 500);
  }
};

// Delete recipe item
export const deleteRecipeIngredient = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);
    const id = String(req.params.id);

    if (!['CEO', 'OWNER'].includes(role)) {
      return errorResponse(res, 'Only CEO can delete recipe ingredients', null, 403);
    }

    await prisma.erpProductRecipe.delete({
      where: { id }
    });

    await writeAuditLog(req, 'DELETE', 'RECIPE', `Recipe ingredient deleted: ${id}`);

    return successResponse(res, null, 'Recipe ingredient deleted successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, null, 500);
  }
};

// Calculate production from recipe
export const calculateProduction = async (req: Request, res: Response) => {
  try {
    const { productId, batchCount } = req.query;

    if (!productId || !batchCount) {
      return errorResponse(res, 'Product ID and batch count required', null, 400);
    }

    const recipes = await prisma.erpProductRecipe.findMany({
      where: { productId: productId as string },
      include: {
        product: true,
        ingredient: true
      }
    });

    if (recipes.length === 0) {
      return errorResponse(res, 'No recipe found for this product', null, 404);
    }

    const batch = Number(batchCount);
    const materialsNeeded = recipes.map(recipe => ({
      ingredient: recipe.ingredient,
      qtyNeeded: recipe.qtyNeeded * batch,
      unitPrice: recipe.unitPrice,
      totalPrice: recipe.qtyNeeded * batch * recipe.unitPrice,
      currentStock: recipe.ingredient.currentStock,
      sufficient: recipe.ingredient.currentStock >= (recipe.qtyNeeded * batch),
      shortage: Math.max(0, (recipe.qtyNeeded * batch) - recipe.ingredient.currentStock)
    }));

    const canProduce = materialsNeeded.every(m => m.sufficient);

    return successResponse(res, {
      product: recipes[0].product,
      batchCount: batch,
      outputQty: batch * recipes[0].product.recipeOutputQty,
      totalCost: materialsNeeded.reduce((sum, material) => sum + material.totalPrice, 0),
      costPerOutput: materialsNeeded.reduce((sum, material) => sum + material.totalPrice, 0) / Math.max(1, batch * recipes[0].product.recipeOutputQty),
      materialsNeeded,
      canProduce,
      message: canProduce ? 'Semua bahan tersedia' : 'Ada bahan yang kurang'
    }, 'Production calculation completed');
  } catch (error: any) {
    return errorResponse(res, error.message, null, 500);
  }
};

// Production with auto material deduction based on recipe
export const produceWithRecipe = async (req: Request, res: Response) => {
  try {
    const { productId, batchCount, date, notes } = req.body;

    if (!productId || !batchCount || batchCount <= 0) {
      return errorResponse(res, 'Invalid production data', null, 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      // Get recipes
      const recipes = await tx.erpProductRecipe.findMany({
        where: { productId },
        include: {
          product: true,
          ingredient: true
        }
      });

      if (recipes.length === 0) {
        throw new Error('No recipe found for this product');
      }

      const batch = Number(batchCount);
      const outputQty = batch * recipes[0].product.recipeOutputQty;

      // Check if all materials are sufficient
      for (const recipe of recipes) {
        const needed = Math.ceil(recipe.qtyNeeded * batch);
        if (recipe.ingredient.currentStock < needed) {
          throw new Error(`Stok ${recipe.ingredient.name} tidak mencukupi. Butuh: ${needed}, Tersedia: ${recipe.ingredient.currentStock}`);
        }
      }

      // Deduct materials
      for (const recipe of recipes) {
        const qtyToDeduct = Math.ceil(recipe.qtyNeeded * batch);
        
        await tx.warehouseItem.update({
          where: { id: recipe.warehouseItemId },
          data: {
            currentStock: {
              decrement: qtyToDeduct
            }
          }
        });

        await tx.warehouseMovement.create({
          data: {
            warehouseItemId: recipe.warehouseItemId,
            type: 'OUT',
            quantity: qtyToDeduct,
            date: new Date(date || Date.now()),
            notes: `Produksi ${recipes[0].product.name} (${batch} batch)`
          }
        });
      }

      // Create production record
      const productionRecord = await tx.productionRecord.create({
        data: {
          productId,
          quantity: outputQty,
          rejectQty: 0,
          date: new Date(date || Date.now()),
          notes: notes || `Produksi dengan resep (${batch} batch, hasil ${outputQty} unit)`
        },
        include: {
          product: true
        }
      });

      // Add to finished goods stock
      await tx.productStockMovement.create({
        data: {
          productId,
          type: 'IN',
          quantity: outputQty,
          reference: `PROD-${productionRecord.id}`,
          notes: `Hasil produksi ${outputQty} unit dari ${batch} batch`
        }
      });

      // Update production target
      const productionDate = new Date(date || Date.now());
      const targetMonth = new Date(productionDate.getFullYear(), productionDate.getMonth(), 1);

      const existingTarget = await tx.productionTarget.findUnique({
        where: {
          productId_targetMonth: {
            productId,
            targetMonth
          }
        }
      });

      if (existingTarget) {
        await tx.productionTarget.update({
          where: {
            productId_targetMonth: {
              productId,
              targetMonth
            }
          },
          data: {
            actualQty: {
              increment: outputQty
            }
          }
        });
      }

      return productionRecord;
    });

    await writeAuditLog(req, 'CREATE', 'PRODUCTION', `Produksi dengan resep: ${result.product.name} (${batchCount} batch)`);

    return successResponse(res, result, 'Production completed with automatic material deduction');
  } catch (error: any) {
    return errorResponse(res, error.message, null, 500);
  }
};
