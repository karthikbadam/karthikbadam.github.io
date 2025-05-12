import { Box, Flex, Link, Stack } from '@chakra-ui/react'

const Navbar = () => {
  return (
    <Box bg="gray.subtle" px={10} shadow="sm">
      <Flex h={16} alignItems="center" justifyContent="space-between">
        <Link 
          href="/"
          fontWeight="bold" 
          fontSize="lg" 
          _hover={{ textDecoration: 'none', color: 'blue.500' }}
          textDecoration="none"
        >
          Karthik Badam
        </Link>
        <Stack direction="row" gap={8}>
          <Link 
            href="/publications"
            _hover={{ textDecoration: 'none', color: 'blue.500' }}
            textDecoration="none"
          >
            Publications
          </Link>
          
          <Link 
            href="/posts"
            _hover={{ textDecoration: 'none', color: 'blue.500' }}
            textDecoration="none"
          >
            Posts
          </Link>
          
          <Link 
            href="/about"
            _hover={{ textDecoration: 'none', color: 'blue.500' }}
            textDecoration="none"
          >
            About
          </Link>
        </Stack>
      </Flex>
    </Box>
  )
}

export default Navbar 