document.addEventListener('DOMContentLoaded', async function () {
    initializeAuth(); // Initialize authentication from auth.js
  
    document.getElementById('signInButton').addEventListener('click', async () => {
      await signIn(); // Sign in user
  
      try {
        const results = await ExcelFileModule.processFiles(); // Fetch Excel data
        UIrenderer.displayExcelData(results); // Render tables in UI
      } catch (error) {
        console.error("Failed to load Excel data:", error);
      }
    });
  
    document.getElementById('signOutButton').addEventListener('click', signOut);
  });

