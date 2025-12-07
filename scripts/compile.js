import solc from 'solc';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findImports(importPath) {
  const contractsPath = path.join(__dirname, '..', 'contracts');
  const fullPath = path.join(contractsPath, importPath);
  
  if (fs.existsSync(fullPath)) {
    return { contents: fs.readFileSync(fullPath, 'utf8') };
  }
  
  return { error: 'File not found' };
}

function compileContracts() {
  const contractsPath = path.join(__dirname, '..', 'contracts');
  const files = fs.readdirSync(contractsPath).filter(f => f.endsWith('.sol'));
  
  const sources = {};
  files.forEach(file => {
    const filePath = path.join(contractsPath, file);
    sources[file] = {
      content: fs.readFileSync(filePath, 'utf8')
    };
  });
  
  const input = {
    language: 'Solidity',
    sources,
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode']
        }
      },
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  };
  
  console.log('Compiling contracts...');
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  
  if (output.errors) {
    output.errors.forEach(error => {
      console.log(error.formattedMessage);
    });
    
    const hasErrors = output.errors.some(e => e.severity === 'error');
    if (hasErrors) {
      process.exit(1);
    }
  }
  
  // Create artifacts directory
  const artifactsPath = path.join(__dirname, '..', 'artifacts', 'contracts');
  fs.mkdirSync(artifactsPath, { recursive: true });
  
  // Save artifacts
  Object.keys(output.contracts).forEach(fileName => {
    Object.keys(output.contracts[fileName]).forEach(contractName => {
      const contract = output.contracts[fileName][contractName];
      const artifact = {
        contractName,
        abi: contract.abi,
        bytecode: contract.evm.bytecode.object,
        deployedBytecode: contract.evm.deployedBytecode.object
      };
      
      const artifactDir = path.join(artifactsPath, fileName);
      fs.mkdirSync(artifactDir, { recursive: true });
      
      const artifactPath = path.join(artifactDir, `${contractName}.json`);
      fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
      
      console.log(`✓ Compiled ${contractName}`);
    });
  });
  
  console.log('\nCompilation successful!');
}

compileContracts();
