import bcrypt from "bcryptjs";
import UserRepository from "./repositories/User.js";

(async function runTest() {
  try {
    const unique = Date.now();
    const userName = `test_login_${unique}`;
    const user_name = `Test Display ${unique}`;
    const password = "password123";
    const hashedPassword = bcrypt.hashSync(password, 8);

    console.log("Creating user with userName and user_name...");
    const user = await UserRepository.createUser({
      userName,
      user_name,
      hashedPassword,
      role: 1,
      city: 1,
    });
    console.log("Created user:", user);

    console.log("\nListing users (first 5):");
    const users = await UserRepository.getAllUsers();
    console.log(users.slice(0, 5));

    console.log("\nUpdating created user to change user_name...");
    await UserRepository.updateUserById(user.id, {
      userName: userName,
      user_name: user_name + " updated",
      role: 1,
      city: 1,
    });

    const updated = (await UserRepository.getAllUsers()).find(
      (u) => u.id === user.id
    );
    console.log("Updated user row:", updated);

    console.log("\nTest finished successfully");
  } catch (err) {
    console.error("Test failed:", err);
  } finally {
    process.exit();
  }
})();
