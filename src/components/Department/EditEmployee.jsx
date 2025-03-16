// ... existing code ...

// Add file change handler with improved logging
const handleFileChange = (e) => {
  const { name, files } = e.target;
  if (files && files.length > 0) {
    console.log(`File selected for ${name}:`, files[0].name, files[0].type, files[0].size);
    
    // Force update the formData state with the file
    setFormData(prev => {
      console.log(`Updating formData with file for ${name}`);
      return {
        ...prev,
        [name]: files[0]
      };
    });
    
    // Add a debug element to verify file selection
    const debugElement = document.getElementById('debug-file-info');
    if (debugElement) {
      debugElement.textContent = `File selected: ${name} - ${files[0].name}`;
    }
  }
};

// Update handleSubmit function with improved file handling
const handleSubmit = async (e) => {
  e.preventDefault();
  
  // Debug: Log the entire formData to see if files are present
  console.log("Full formData state:", Object.keys(formData).map(key => {
    return {
      key,
      type: formData[key] instanceof File ? 'File' : typeof formData[key],
      value: formData[key] instanceof File ? formData[key].name : formData[key]
    };
  }));
  
  // Check if we have any files to upload - use more explicit check
  const hasFiles = Boolean(
    formData.panCardFile || 
    formData.bankAccountProofFile || 
    formData.aadharCardFile || 
    formData.officeMemoFile || 
    formData.joiningReportFile
  );
  
  console.log("Form submission started with files:", hasFiles);
  
  // Force multipart/form-data approach for testing
  const useFormData = true; // Set to true to force using FormData
  
  if (hasFiles || useFormData) {
    // Use FormData for multipart/form-data
    const submitData = new FormData();
    
    // Add all text fields to FormData
    Object.keys(formData).forEach(key => {
      // Skip file fields as we'll handle them separately
      if (!key.includes('File') && formData[key] !== null && formData[key] !== undefined) {
        submitData.append(key, formData[key]);
      }
    });
    
    // Add file fields to FormData with the correct field names
    if (formData.panCardFile) {
      console.log("Adding PAN Card file:", formData.panCardFile.name);
      submitData.append('panCardDoc', formData.panCardFile);
    }
    
    if (formData.bankAccountProofFile) {
      console.log("Adding Bank Account file:", formData.bankAccountProofFile.name);
      submitData.append('bankAccountDoc', formData.bankAccountProofFile);
    }
    
    if (formData.aadharCardFile) {
      console.log("Adding Aadhar Card file:", formData.aadharCardFile.name);
      submitData.append('aadharCardDoc', formData.aadharCardFile);
    }
    
    if (formData.officeMemoFile) {
      console.log("Adding Office Memo file:", formData.officeMemoFile.name);
      submitData.append('officeMemoDoc', formData.officeMemoFile);
    }
    
    if (formData.joiningReportFile) {
      console.log("Adding Joining Report file:", formData.joiningReportFile.name);
      submitData.append('joiningReportDoc', formData.joiningReportFile);
    }
    
    console.log("Making multipart/form-data PATCH request with files...");
    
    try {
      const response = await axios.patch(`/api/employees/${employee.id}`, submitData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      console.log("Response success (multipart):", response.data);
      
      if (response.status === 200) {
        toast.success('Employee updated successfully');
        onClose();
        onUpdate();
      }
    } catch (error) {
      console.error('Error updating employee with files:', error);
      toast.error('Failed to update employee: ' + (error.response?.data?.message || error.message));
    }
  } else {
    // No files to upload, use regular JSON
    console.log("No files to upload, using JSON request");
    
    // Create a clean data object without file fields
    const cleanData = {};
    Object.keys(formData).forEach(key => {
      if (!key.includes('File') && formData[key] !== null && formData[key] !== undefined) {
        cleanData[key] = formData[key];
      }
    });
    
    try {
      const response = await axios.patch(`/api/employees/${employee.id}`, cleanData);
      console.log("Response success (JSON):", response.data);
      
      if (response.status === 200) {
        toast.success('Employee updated successfully');
        onClose();
        onUpdate();
      }
    } catch (error) {
      console.error('Error updating employee:', error);
      toast.error('Failed to update employee: ' + (error.response?.data?.message || error.message));
    }
  }
};

// In your return/render section, update the form:
return (
  <div className="modal">
    <div className="modal-content">
      <div className="modal-header">
        <h2>Edit Employee</h2>
        <button onClick={onClose} className="close-btn">&times;</button>
      </div>
      <form onSubmit={handleSubmit} encType="multipart/form-data">
        {/* Keep your existing form fields */}
        {/* ... */}
        
        {/* PAN Card upload */}
        <div className="form-group">
          <label>PAN Card</label>
          <input 
            type="file" 
            name="panCardFile" 
            onChange={handleFileChange} 
            className="form-control-file" 
          />
          {formData.panCardFile && <span className="file-name">{formData.panCardFile.name}</span>}
          {employee.panCardUrl && employee.panCardUrl !== '' && (
            <a href={employee.panCardUrl} target="_blank" rel="noopener noreferrer" className="view-link">
              View existing document
            </a>
          )}
        </div>

        {/* Bank Account Proof upload */}
        <div className="form-group">
          <label>Bank Account Proof</label>
          <input 
            type="file" 
            name="bankAccountProofFile" 
            onChange={handleFileChange} 
            className="form-control-file" 
          />
          {formData.bankAccountProofFile && <span className="file-name">{formData.bankAccountProofFile.name}</span>}
          {employee.bankProofUrl && employee.bankProofUrl !== '' && (
            <a href={employee.bankProofUrl} target="_blank" rel="noopener noreferrer" className="view-link">
              View existing document
            </a>
          )}
        </div>

        {/* Adhar Number upload */}
        <div className="form-group">
          <label>Adhar Number</label>
          <input 
            type="file" 
            name="aadharCardFile" 
            onChange={handleFileChange} 
            className="form-control-file" 
          />
          {formData.aadharCardFile && <span className="file-name">{formData.aadharCardFile.name}</span>}
          {employee.aadharCardUrl && employee.aadharCardUrl !== '' && (
            <a href={employee.aadharCardUrl} target="_blank" rel="noopener noreferrer" className="view-link">
              View existing document
            </a>
          )}
        </div>

        {/* Office Memo upload */}
        <div className="form-group">
          <label>Office Memo</label>
          <input 
            type="file" 
            name="officeMemoFile" 
            onChange={handleFileChange} 
            className="form-control-file" 
          />
          {formData.officeMemoFile && <span className="file-name">{formData.officeMemoFile.name}</span>}
          {employee.officeMemoUrl && employee.officeMemoUrl !== '' && (
            <a href={employee.officeMemoUrl} target="_blank" rel="noopener noreferrer" className="view-link">
              View existing document
            </a>
          )}
        </div>

        {/* Joining Report upload */}
        <div className="form-group">
          <label>Joining Report</label>
          <input 
            type="file" 
            name="joiningReportFile" 
            onChange={handleFileChange} 
            className="form-control-file" 
          />
          {formData.joiningReportFile && <span className="file-name">{formData.joiningReportFile.name}</span>}
          {employee.joiningReportUrl && employee.joiningReportUrl !== '' && (
            <a href={employee.joiningReportUrl} target="_blank" rel="noopener noreferrer" className="view-link">
              View existing document
            </a>
          )}
        </div>
        
        {/* Submit button */}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">Update Employee</button>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  </div>
);