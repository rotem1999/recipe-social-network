# data-access-images

Cloud Storage for Firebase through the Admin SDK only (service-account credential; project on Blaze). Env: Firebase project id, bucket name, credential path. Upload: write the bytes to the bucket, return the object path. Display: `File.getSignedUrl`, read action, expiry fixed at build time, at most 7 days. Security Rules deny all client access. No Firebase SDK or key ever ships to the client.
