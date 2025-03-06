document.addEventListener('DOMContentLoaded', async function () {
    initializeAuth(); // Initialize authentication from auth.js
  
    document.getElementById('signInButton').addEventListener('click', async () => {
      await signIn(); // Sign in user
      document.getElementById('loginContainer').style.display = 'none';
      document.getElementById('appContainer').style.display = 'block';
  
      try {
        const results = await ExcelFileModule.processFiles(); // Fetch Excel data
        ExcelUI.displayExcelData(results); // Render tables in UI
      } catch (error) {
        console.error("Failed to load Excel data:", error);
      }
    });
  
    document.getElementById('signOutButton').addEventListener('click', signOut);
  });

