import { PrismaClient, Product, SubscriptionItem } from '@prisma/client';

const prisma = new PrismaClient();

export interface AvailableItem {
  item: SubscriptionItem;
  product: Product;
}

export interface SkippedItem {
  productId: string;
  productName: string;
  reason: string;
}

export interface ValidationResult {
  availableItems: AvailableItem[];
  skippedItems: SkippedItem[];
  totalCents: number;
}

/**
 * InventoryValidator checks product availability before subscription renewal
 *
 * Business rules:
 * - Product must exist in database
 * - Product must be active (isActive = true)
 * - Product must have sufficient stock (if stock tracking enabled)
 * - Uses CURRENT product prices (not locked-in prices)
 */
export class InventoryValidator {
  /**
   * Validate subscription items before renewal
   *
   * @param subscriptionItems - Items in the subscription
   * @returns Available items, skipped items, and total cost
   */
  async validateSubscriptionItems(
    subscriptionItems: SubscriptionItem[]
  ): Promise<ValidationResult> {
    const availableItems: AvailableItem[] = [];
    const skippedItems: SkippedItem[] = [];
    let totalCents = 0;

    console.log(`[InventoryValidator] Validating ${subscriptionItems.length} subscription items`);

    for (const item of subscriptionItems) {
      try {
        // Fetch current product data
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
        });

        // Check 1: Product exists
        if (!product) {
          console.log(`[InventoryValidator] Product ${item.productId} not found`);
          skippedItems.push({
            productId: item.productId,
            productName: 'Unknown Product',
            reason: 'Product not found in catalog',
          });
          continue;
        }

        // Check 2: Product is active
        if (!product.isActive) {
          console.log(`[InventoryValidator] Product ${product.id} (${product.name}) is inactive`);
          skippedItems.push({
            productId: product.id,
            productName: product.name,
            reason: 'Product has been discontinued',
          });
          continue;
        }

        // Check 3: Product is in stock
        if (!product.inStock) {
          console.log(`[InventoryValidator] Product ${product.id} (${product.name}) is out of stock`);
          skippedItems.push({
            productId: product.id,
            productName: product.name,
            reason: 'Product is currently out of stock',
          });
          continue;
        }

        // Check 4: Sufficient stock quantity (if stock tracking enabled)
        if (product.stockCount !== null && product.stockCount < item.quantity) {
          console.log(
            `[InventoryValidator] Product ${product.id} (${product.name}) insufficient stock. ` +
            `Available: ${product.stockCount}, needed: ${item.quantity}`
          );
          skippedItems.push({
            productId: product.id,
            productName: product.name,
            reason: `Insufficient stock (available: ${product.stockCount}, needed: ${item.quantity})`,
          });
          continue;
        }

        // Product is available - use CURRENT price
        availableItems.push({ item, product });
        totalCents += product.priceCents * item.quantity;

        console.log(
          `[InventoryValidator] Product ${product.id} (${product.name}) available. ` +
          `Price: $${(product.priceCents / 100).toFixed(2)} × ${item.quantity} = $${((product.priceCents * item.quantity) / 100).toFixed(2)}`
        );
      } catch (error) {
        // Database error or unexpected issue
        console.error(`[InventoryValidator] Error validating item ${item.id}:`, error);
        skippedItems.push({
          productId: item.productId,
          productName: 'Unknown Product',
          reason: 'Error checking product availability',
        });
      }
    }

    console.log(
      `[InventoryValidator] Validation complete. ` +
      `Available: ${availableItems.length}, Skipped: ${skippedItems.length}, ` +
      `Total: $${(totalCents / 100).toFixed(2)}`
    );

    return {
      availableItems,
      skippedItems,
      totalCents,
    };
  }

  /**
   * Check if a single product is available
   * Useful for individual product checks
   */
  async checkProductAvailability(productId: string): Promise<{
    available: boolean;
    product: Product | null;
    reason?: string;
  }> {
    try {
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        return {
          available: false,
          product: null,
          reason: 'Product not found',
        };
      }

      if (!product.isActive) {
        return {
          available: false,
          product,
          reason: 'Product discontinued',
        };
      }

      if (!product.inStock) {
        return {
          available: false,
          product,
          reason: 'Out of stock',
        };
      }

      return {
        available: true,
        product,
      };
    } catch (error) {
      console.error('[InventoryValidator] Error checking product availability:', error);
      return {
        available: false,
        product: null,
        reason: 'Error checking availability',
      };
    }
  }
}

export default InventoryValidator;
