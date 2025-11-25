// import React from 'react';
// import ReactDOM from 'react-dom';
// import './index.css';
// import App from './App';

// ReactDOM.render(
//   <React.StrictMode>
//     <App />
//   </React.StrictMode>,
//   document.getElementById('root')
// );

import React from 'react';
import ReactDOM from 'react-dom/client';  // Import from 'react-dom/client'
import './index.css';
import App from './App';

// Create a root for React 18
const root = ReactDOM.createRoot(document.getElementById('root'));

// Render the app using createRoot
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


