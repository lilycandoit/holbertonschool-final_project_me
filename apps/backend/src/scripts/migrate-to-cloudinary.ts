import { v2 as cloudinary } from 'cloudinary';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Image mapping: local path -> product name pattern
const imageFiles = [
  'Anemones.jpg',
  'Carnation.jpg',
  'Daffodil.jpg',
  'Daisies.jpg',
  'Filler.jpg',
  'Filler2.jpg',
  'Filler3.jpg',
  'Filler4.jpg',
  'Filler5.jpg',
  'Filler6.jpg',
  'Filler7.jpg',
  'Filler8.jpg',
  'Gardenia.jpg',
  'Lilys.jpg',
  'Merigold.jpg',
  'Orchids.jpg',
  'Peonies.jpg',
  'Roses.jpg',
  'Sunflowers.jpg',
  'Tulips.jpg',
];

interface UploadResult {
  fileName: string;
  cloudinaryUrl: string;
  publicId: string;
  originalPath: string;
}

async function uploadToCloudinary(
  filePath: string,
  fileName: string
): Promise<UploadResult> {
  try {
    console.log(`📤 Uploading ${fileName}...`);

    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'flora/products',
      public_id: fileName.replace(/\.[^/.]+$/, ''), // Remove extension
      resource_type: 'image',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' }, // Max dimensions
        { quality: 'auto:good' }, // Automatic quality optimization
        { fetch_format: 'auto' }, // Auto format (WebP for modern browsers)
      ],
    });

    console.log(`✅ Uploaded ${fileName} -> ${result.secure_url}`);

    return {
      fileName,
      cloudinaryUrl: result.secure_url,
      publicId: result.public_id,
      originalPath: `/images/${fileName}`,
    };
  } catch (error) {
    console.error(`❌ Failed to upload ${fileName}:`, error);
    throw error;
  }
}

async function updateDatabase(uploadResults: UploadResult[]) {
  console.log('\n📊 Updating database...');

  for (const result of uploadResults) {
    try {
      // Update products that match this image path
      const updateResult = await prisma.product.updateMany({
        where: {
          imageUrl: result.originalPath,
        },
        data: {
          imageUrl: result.cloudinaryUrl,
        },
      });

      if (updateResult.count > 0) {
        console.log(
          `✅ Updated ${updateResult.count} product(s) with ${result.fileName}`
        );
      } else {
        console.log(`⚠️  No products found with path ${result.originalPath}`);
      }
    } catch (error) {
      console.error(`❌ Failed to update database for ${result.fileName}:`, error);
    }
  }
}

async function main() {
  console.log('🚀 Flora Image Migration to Cloudinary\n');

  // Verify Cloudinary configuration
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    console.error('❌ Missing Cloudinary credentials in environment variables:');
    console.error('   CLOUDINARY_CLOUD_NAME');
    console.error('   CLOUDINARY_API_KEY');
    console.error('   CLOUDINARY_API_SECRET');
    console.error('\n💡 Get these from https://console.cloudinary.com/');
    process.exit(1);
  }

  console.log(`☁️  Cloudinary Cloud: ${process.env.CLOUDINARY_CLOUD_NAME}`);
  console.log(`📁 Uploading to folder: flora/products\n`);

  const imagesDir = path.join(__dirname, '../../images');
  const uploadResults: UploadResult[] = [];

  // Check if images directory exists
  if (!fs.existsSync(imagesDir)) {
    console.error(`❌ Images directory not found: ${imagesDir}`);
    process.exit(1);
  }

  console.log(`📂 Images directory: ${imagesDir}\n`);

  // Upload all images
  for (const fileName of imageFiles) {
    const filePath = path.join(imagesDir, fileName);

    if (fs.existsSync(filePath)) {
      const result = await uploadToCloudinary(filePath, fileName);
      uploadResults.push(result);
    } else {
      console.warn(`⚠️  File not found: ${fileName}`);
    }
  }

  console.log(`\n✨ Uploaded ${uploadResults.length}/${imageFiles.length} images\n`);

  // Update database
  await updateDatabase(uploadResults);

  console.log('\n📋 Migration Summary:');
  console.log(`   Total images uploaded: ${uploadResults.length}`);
  console.log(`   Cloudinary folder: flora/products`);
  console.log(`   Database records updated: ${uploadResults.length}`);
  console.log('\n✅ Migration complete!');

  // Show sample URLs
  console.log('\n📸 Sample Cloudinary URLs:');
  uploadResults.slice(0, 3).forEach((result) => {
    console.log(`   ${result.fileName}: ${result.cloudinaryUrl}`);
  });

  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    prisma.$disconnect();
    process.exit(1);
  });
